# 💬 Nachrichtenwand (Message Board)

Eine moderne, serverlose Message Board Anwendung, die vollständig auf AWS läuft. Frontend gehostet auf GitHub Pages (oder S3), Backend auf AWS Lambda & DynamoDB.

## 📁 Projektstruktur

Das Projekt ist in folgende Bereiche unterteilt:

```
/
├── frontend/               # Frontend-Quellcode
│   ├── index.html          # Hauptseite
│   ├── css/                # Stylesheets
│   └── js/                 # Client-seitige Logik (API-Kommunikation)
│
├── backend/                # AWS Serverless Backend
│   ├── lambda/             # Lambda-Funktionen (Python)
│   └── iam/                # IAM Policies & Rollen-Definitionen
│
└── docs/                   # Dokumentation
    └── AWS_MIGRATION_GUIDE.md
```

## 🚀 Technologien

- **Frontend:** HTML5, CSS3, Vanilla JavaScript
- **Backend:** AWS Lambda (Python 3.12)
- **Datenbank:** AWS DynamoDB
- **API:** AWS API Gateway

## 🛠 Setup & Installation

### Lokale Entwicklung

1. Repository klonen
2. Webserver im `frontend` Verzeichnis starten:
   ```bash
   cd frontend
   python3 -m http.server 8000
   ```
3. Browser öffnen: `http://localhost:8000`

### AWS Deployment

Detaillierte Anweisungen zur Einrichtung der AWS-Ressourcen findest du im [AWS Migration Guide](docs/AWS_MIGRATION_GUIDE.md).

## ✨ Features

- Nachrichten schreiben und lesen
- Persistente Speicherung in DynamoDB
- Server-generierte Zeitstempel und IDs
- Modernes, responsives Design
- Echtzeit-ähnliche Updates (beim Neuladen/Absenden)

---
© 2025 Message Board Project
