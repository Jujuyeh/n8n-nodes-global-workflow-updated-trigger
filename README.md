# n8n-nodes-global-workflow-updated-trigger

A **global trigger node** for [n8n](https://n8n.io) that emits an item whenever **any workflow in your n8n instance** gets updated.

[![CI](https://github.com/Jujuyeh/n8n-nodes-global-workflow-updated-trigger/actions/workflows/ci.yml/badge.svg)](https://github.com/Jujuyeh/n8n-nodes-global-workflow-updated-trigger/actions/workflows/ci.yml)


Since n8n Community Edition doesn't expose a global “workflow updated” event, this node implements **light internal polling** with persistent state to detect changes without noise or duplicates.

---

## 🚀 Features

- Detects updates across all workflows in your n8n instance.
- Emits one item per updated workflow.
- Optionally includes the full workflow JSON.
- Persists state (`lastSync` and per-ID map) to avoid duplicates.
- Optional Basic Auth support for secured instances.

---

## ⚙️ Installation

### Option 1: Local / Docker deployment

1. Build the node:
```bash
npm install
npm run build
```

2.	Mount it in your docker-compose.yml:

```yaml
volumes:
  - ./n8n-nodes-global-workflow-updated-trigger:/home/node/custom-nodes:ro
environment:
  N8N_CUSTOM_EXTENSIONS: /home/node/custom-nodes
```

3.	Restart n8n:

```bash
docker compose up -d
```


### Option 2: Install from npm

```bash
npm install n8n-nodes-global-workflow-updated-trigger
```

Then mount it using:

```yaml
environment:
  N8N_CUSTOM_EXTENSIONS: /home/node/node_modules/n8n-nodes-global-workflow-updated-trigger
```

---

## 🧩 Usage

Add Global Workflow Updated Trigger to a new workflow and configure:

Option             |	Description
-------------------|------------------------------------------------------
Base URL	       | Usually http://localhost:5678 inside the container
Interval (seconds) | How often to check for changes (5–15s recommended)
Exclude Regex	   | Skip workflows whose names match this pattern
Emit Full Workflow | If true, includes the full workflow JSON
Credentials	       | Use HTTP Basic Auth if your instance requires it


---

## 🔄 Example Output

```json
{
  "id": 42,
  "name": "Daily Report",
  "updatedAt": "2025-10-29T12:34:56.000Z",
  "workflow": {
    "id": 42,
    "name": "Daily Report",
    "nodes": [...],
    "connections": {...}
  }
}
```

---

## 🧠 Best Practices
 - Set the regex to ignore this trigger’s own workflow.
 - Keep the polling interval modest (≥5s).
 - Use this node to drive GitHub or S3 backup workflows.
 - Combine with HTTP → GitHub “Create/Update file” to version-control your workflows.