# AWS Migration Guide

Dieses Dokument enthält alle notwendigen Schritte und Code-Snippets für die Migration der Message Board Application von localStorage zu AWS.

## Voraussetzungen

1. AWS Account erstellen (falls noch nicht vorhanden)
2. AWS CLI konfigurieren:
   ```bash
   aws configure
   ```

## Schritt 1: DynamoDB Table erstellen

```bash
aws dynamodb create-table \
  --table-name MessageBoard \
  --attribute-definitions \
    AttributeName=messageId,AttributeType=S \
    AttributeName=timestamp,AttributeType=N \
  --key-schema \
    AttributeName=messageId,KeyType=HASH \
    AttributeName=timestamp,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region eu-central-1
```

Überprüfen:
```bash
aws dynamodb describe-table --table-name MessageBoard
```

## Schritt 2: Lambda Function erstellen

### 2.1 Lambda Code erstellen

Erstelle eine Datei `lambda_function.py`:

```python
import json
import boto3
import uuid
from datetime import datetime
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('MessageBoard')

def lambda_handler(event, context):
    # CORS Headers
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS'
    }
    
    # Handle OPTIONS (preflight)
    if event['httpMethod'] == 'OPTIONS':
        return {'statusCode': 200, 'headers': headers, 'body': ''}
    
    # GET - Load messages
    if event['httpMethod'] == 'GET':
        try:
            response = table.scan()
            items = response.get('Items', [])
            # Sort by timestamp descending
            items.sort(key=lambda x: x['timestamp'], reverse=True)
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps(items, default=str)
            }
        except Exception as e:
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({'error': str(e)})
            }
    
    # POST - Create message
    if event['httpMethod'] == 'POST':
        try:
            body = json.loads(event['body'])
            
            # Validate input
            if not body.get('content') or len(body['content']) > 500:
                return {
                    'statusCode': 400,
                    'headers': headers,
                    'body': json.dumps({'error': 'Invalid message content'})
                }
            
            message = {
                'messageId': str(uuid.uuid4()),
                'timestamp': int(datetime.now().timestamp() * 1000),
                'content': body['content'],
                'createdAt': datetime.now().isoformat()
            }
            
            table.put_item(Item=message)
            
            return {
                'statusCode': 201,
                'headers': headers,
                'body': json.dumps(message, default=str)
            }
        except Exception as e:
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({'error': str(e)})
            }
    
    return {
        'statusCode': 400,
        'headers': headers,
        'body': json.dumps({'error': 'Invalid method'})
    }
```

### 2.2 Lambda Deployment Package erstellen

```bash
# Erstelle Deployment-Verzeichnis
mkdir lambda-deployment
cd lambda-deployment

# Kopiere Lambda-Code
cp ../lambda_function.py .

# Erstelle ZIP
zip -r lambda-function.zip lambda_function.py

# Zurück zum Hauptverzeichnis
cd ..
```

### 2.3 IAM Role für Lambda erstellen

Erstelle `trust-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

Erstelle die Role:

```bash
aws iam create-role \
  --role-name MessageBoardLambdaRole \
  --assume-role-policy-document file://trust-policy.json
```

Füge Policies hinzu:

```bash
# CloudWatch Logs
aws iam attach-role-policy \
  --role-name MessageBoardLambdaRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

# DynamoDB Access
aws iam put-role-policy \
  --role-name MessageBoardLambdaRole \
  --policy-name DynamoDBAccess \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:Scan",
          "dynamodb:Query",
          "dynamodb:DeleteItem"
        ],
        "Resource": "arn:aws:dynamodb:*:*:table/MessageBoard"
      }
    ]
  }'
```

### 2.4 Lambda Function deployen

```bash
# Hole die Role ARN
ROLE_ARN=$(aws iam get-role --role-name MessageBoardLambdaRole --query 'Role.Arn' --output text)

# Erstelle Lambda Function
aws lambda create-function \
  --function-name MessageBoardAPI \
  --runtime python3.12 \
  --role $ROLE_ARN \
  --handler lambda_function.lambda_handler \
  --zip-file fileb://lambda-deployment/lambda-function.zip \
  --timeout 10 \
  --memory-size 128
```

## Schritt 3: API Gateway erstellen

### 3.1 REST API erstellen

```bash
# Erstelle API
API_ID=$(aws apigateway create-rest-api \
  --name MessageBoardAPI \
  --description "API for Message Board Application" \
  --query 'id' \
  --output text)

echo "API ID: $API_ID"

# Hole Root Resource ID
ROOT_ID=$(aws apigateway get-resources \
  --rest-api-id $API_ID \
  --query 'items[0].id' \
  --output text)

# Erstelle /messages Resource
RESOURCE_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $ROOT_ID \
  --path-part messages \
  --query 'id' \
  --output text)
```

### 3.2 Methoden hinzufügen

```bash
# GET Method
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $RESOURCE_ID \
  --http-method GET \
  --authorization-type NONE

# POST Method
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $RESOURCE_ID \
  --http-method POST \
  --authorization-type NONE

# OPTIONS Method (für CORS)
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $RESOURCE_ID \
  --http-method OPTIONS \
  --authorization-type NONE
```

### 3.3 Lambda Integration

```bash
# Hole Account ID und Region
ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text)
REGION=$(aws configure get region)
LAMBDA_ARN="arn:aws:lambda:$REGION:$ACCOUNT_ID:function:MessageBoardAPI"

# GET Integration
aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $RESOURCE_ID \
  --http-method GET \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/$LAMBDA_ARN/invocations"

# POST Integration
aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $RESOURCE_ID \
  --http-method POST \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/$LAMBDA_ARN/invocations"

# Lambda Permission für API Gateway
aws lambda add-permission \
  --function-name MessageBoardAPI \
  --statement-id apigateway-get \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:$REGION:$ACCOUNT_ID:$API_ID/*/*/messages"
```

### 3.4 CORS konfigurieren

```bash
# OPTIONS Integration (Mock)
aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $RESOURCE_ID \
  --http-method OPTIONS \
  --type MOCK \
  --request-templates '{"application/json": "{\"statusCode\": 200}"}'

# OPTIONS Integration Response
aws apigateway put-integration-response \
  --rest-api-id $API_ID \
  --resource-id $RESOURCE_ID \
  --http-method OPTIONS \
  --status-code 200 \
  --response-parameters '{
    "method.response.header.Access-Control-Allow-Headers": "'\''Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'\''",
    "method.response.header.Access-Control-Allow-Methods": "'\''GET,POST,OPTIONS'\''",
    "method.response.header.Access-Control-Allow-Origin": "'\''*'\''"
  }'

# OPTIONS Method Response
aws apigateway put-method-response \
  --rest-api-id $API_ID \
  --resource-id $RESOURCE_ID \
  --http-method OPTIONS \
  --status-code 200 \
  --response-parameters '{
    "method.response.header.Access-Control-Allow-Headers": true,
    "method.response.header.Access-Control-Allow-Methods": true,
    "method.response.header.Access-Control-Allow-Origin": true
  }'
```

### 3.5 API deployen

```bash
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name prod

# API URL ausgeben
echo "API URL: https://$API_ID.execute-api.$REGION.amazonaws.com/prod/messages"
```

## Schritt 4: Frontend anpassen

Ersetze in `script.js` die localStorage-Funktionen durch API-Calls:

```javascript
// Configuration - FÜGE DEINE API URL HINZU
const CONFIG = {
  API_URL: 'https://YOUR_API_ID.execute-api.eu-central-1.amazonaws.com/prod/messages',
  MAX_MESSAGE_LENGTH: 500,
  ANIMATION_DELAY: 100
};

// Load messages from API
async function loadMessages() {
  try {
    const response = await fetch(CONFIG.API_URL);
    if (!response.ok) throw new Error('Failed to load messages');
    messages = await response.json();
  } catch (error) {
    console.error('Error loading messages:', error);
    showError('Fehler beim Laden der Nachrichten.');
  }
}

// Save message to API
async function saveMessage(message) {
  try {
    const response = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });
    
    if (!response.ok) throw new Error('Failed to save message');
    
    return await response.json();
  } catch (error) {
    console.error('Error saving message:', error);
    showError('Fehler beim Speichern der Nachricht.');
    throw error;
  }
}

// Update handleSubmit function
async function handleSubmit() {
  const messageInput = document.getElementById('messageInput');
  const content = messageInput.value.trim();
  
  if (!content) {
    showError('Bitte gib eine Nachricht ein.');
    return;
  }
  
  if (content.length > CONFIG.MAX_MESSAGE_LENGTH) {
    showError(`Die Nachricht darf maximal ${CONFIG.MAX_MESSAGE_LENGTH} Zeichen lang sein.`);
    return;
  }
  
  // Create message object (without ID and timestamp - server generates these)
  const messageData = { content: content };
  
  try {
    // Save to API
    const savedMessage = await saveMessage(messageData);
    
    // Add to local array
    messages.unshift(savedMessage);
    
    // Clear input
    messageInput.value = '';
    updateCharCounter();
    
    // Re-render
    renderMessages();
    
    // Show success
    showSuccess();
  } catch (error) {
    // Error already handled in saveMessage
  }
}

// Update initialization
async function initializeApp() {
  // Load messages from API
  await loadMessages();
  
  // Setup event listeners
  setupEventListeners();
  
  // Render initial state
  renderMessages();
}
```

## Schritt 5: Testen

1. Öffne die Anwendung im Browser
2. Erstelle eine Testnachricht
3. Überprüfe in der AWS Console:
   - DynamoDB: Nachricht sollte in der Tabelle erscheinen
   - Lambda: CloudWatch Logs überprüfen
   - API Gateway: Metrics ansehen

## Cleanup (Optional)

Falls du die AWS-Ressourcen wieder löschen möchtest:

```bash
# Lambda Function löschen
aws lambda delete-function --function-name MessageBoardAPI

# API Gateway löschen
aws apigateway delete-rest-api --rest-api-id $API_ID

# DynamoDB Table löschen
aws dynamodb delete-table --table-name MessageBoard

# IAM Role löschen
aws iam detach-role-policy \
  --role-name MessageBoardLambdaRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

aws iam delete-role-policy \
  --role-name MessageBoardLambdaRole \
  --policy-name DynamoDBAccess

aws iam delete-role --role-name MessageBoardLambdaRole
```

## Troubleshooting

### CORS-Fehler
- Überprüfe, ob OPTIONS-Methode korrekt konfiguriert ist
- Stelle sicher, dass Lambda CORS-Headers zurückgibt

### Lambda-Fehler
- Überprüfe CloudWatch Logs: `aws logs tail /aws/lambda/MessageBoardAPI --follow`
- Stelle sicher, dass IAM Role korrekt konfiguriert ist

### DynamoDB-Fehler
- Überprüfe, ob Table existiert: `aws dynamodb list-tables`
- Stelle sicher, dass Lambda die richtigen Permissions hat
