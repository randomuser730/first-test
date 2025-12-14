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
            
            # Convert Decimal to int/float for all fields
            def convert_decimals(obj):
                if isinstance(obj, list):
                    return [convert_decimals(i) for i in obj]
                elif isinstance(obj, dict):
                    return {k: convert_decimals(v) for k, v in obj.items()}
                elif isinstance(obj, Decimal):
                    # Convert to int if it's a whole number, otherwise float
                    if obj % 1 == 0:
                        return int(obj)
                    else:
                        return float(obj)
                else:
                    return obj
            
            items = convert_decimals(items)
            
            # Sort by timestamp descending
            items.sort(key=lambda x: x.get('timestamp', 0), reverse=True)
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps(items)
            }
        except Exception as e:
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({'error': str(e)})
            }
    
    # POST - Create message OR Add reaction
    if event['httpMethod'] == 'POST':
        try:
            body = json.loads(event['body'])
            
            # CASE 1: Add Reaction (if messageId and reaction are present)
            if 'messageId' in body and 'reaction' in body:
                message_id = body['messageId']
                timestamp = body['timestamp']
                reaction = body['reaction']
                
                # Update DynamoDB item to increment reaction count
                # Try to ADD to existing reactions map
                try:
                    table.update_item(
                        Key={'messageId': message_id, 'timestamp': timestamp},
                        UpdateExpression="ADD reactions.#r :inc",
                        ExpressionAttributeNames={'#r': reaction},
                        ExpressionAttributeValues={':inc': 1},
                        ConditionExpression='attribute_exists(reactions)'
                    )
                except Exception as e:
                    # reactions attribute doesn't exist, create it first
                    print(f"First update failed with: {str(e)}, attempting to initialize reactions map")
                    table.update_item(
                        Key={'messageId': message_id, 'timestamp': timestamp},
                        UpdateExpression="SET reactions = :empty_map",
                        ExpressionAttributeValues={':empty_map': {}}
                    )
                    # Now add the reaction
                    table.update_item(
                        Key={'messageId': message_id, 'timestamp': timestamp},
                        UpdateExpression="ADD reactions.#r :inc",
                        ExpressionAttributeNames={'#r': reaction},
                        ExpressionAttributeValues={':inc': 1}
                    )
                
                return {
                    'statusCode': 200,
                    'headers': headers,
                    'body': json.dumps({'success': True})
                }

            # CASE 2: Create New Message
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
                'avatar': body.get('avatar', 'anonymous'),  # Default to anonymous
                'reactions': {},  # Initialize empty reactions
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
