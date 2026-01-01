# Party Q&A Game - Frontend Integration Guide

## Step 1: Project Structure Setup

Create this folder structure in your project:

```
party-game/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── docker-compose.yml
├── frontend/
│   ├── index.html          ← Copy your frontend HTML here
│   ├── Dockerfile
│   └── nginx.conf
└── README.md
```

## Step 2: Update Your Backend (main.py)

Add CORS middleware and static file serving to your FastAPI app:

```python
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

app = FastAPI(title="Party Q&A Game")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins (customize for production)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files (CSS, JS, images)
if os.path.exists("static"):
    app.mount("/static", StaticFiles(directory="static"), name="static")

# Serve index.html for root path
@app.get("/", response_class=FileResponse)
async def serve_frontend():
    return "frontend/index.html"

# Your existing API endpoints
@app.get("/api/games")
async def get_games():
    # Your game logic
    return {"games": []}

@app.post("/api/games")
async def create_game():
    # Your game creation logic
    return {"game_id": "123"}

@app.post("/api/games/{game_id}/answer")
async def submit_answer(game_id: str, answer: dict):
    # Store answer in database
    return {"status": "submitted"}

@app.post("/api/games/{game_id}/vote")
async def submit_vote(game_id: str, vote: dict):
    # Store vote in database
    return {"status": "voted"}

# WebSocket for real-time updates (optional)
@app.websocket("/ws/game/{game_id}")
async def websocket_endpoint(websocket: WebSocket, game_id: str):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            # Broadcast to all players in game
            await websocket.send_text(f"Echo: {data}")
    except Exception as e:
        print(f"WebSocket error: {e}")
```

## Step 3: Create Frontend Dockerfile

Create `frontend/Dockerfile`:

```dockerfile
# Use nginx to serve static HTML
FROM nginx:alpine

# Copy your HTML file to nginx
COPY index.html /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/nginx.conf

# Expose port 3000
EXPOSE 3000

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
```

## Step 4: Create nginx.conf

Create `frontend/nginx.conf`:

```nginx
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    gzip on;

    server {
        listen 3000;
        server_name localhost;
        root /usr/share/nginx/html;

        # Serve index.html for all routes (SPA support)
        location / {
            try_files $uri /index.html;
        }

        # API proxy to backend
        location /api/ {
            proxy_pass http://backend:8000;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # WebSocket support
        location /ws/ {
            proxy_pass http://backend:8000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
        }
    }
}
```

## Step 5: Create Docker Compose

Create `docker-compose.yml` in project root:

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: party-game-backend
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://user:password@db:5432/party_game
    depends_on:
      - db
    command: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
    volumes:
      - ./backend:/app

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: party-game-frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend
    volumes:
      - ./frontend:/usr/share/nginx/html

  db:
    image: postgres:15-alpine
    container_name: party-game-db
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=party_game
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

## Step 6: Update Frontend JavaScript for API Integration

In your `index.html`, update the JavaScript section:

```javascript
const app = {
    // ... existing code ...
    
    apiUrl: "http://localhost:8000", // Or use window.location.origin for production
    gameId: null,
    playerId: null,
    
    async submitAnswer() {
        const answer = document.getElementById('answerText').value;
        
        try {
            const response = await fetch(`${this.apiUrl}/api/games/${this.gameId}/answer`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    player_id: this.playerId,
                    answer: answer
                })
            });
            
            const data = await response.json();
            if (data.status === 'submitted') {
                this.switchToVoting();
            }
        } catch (error) {
            console.error('Error submitting answer:', error);
        }
    },
    
    async submitVotes() {
        const selectedVoteId = document.querySelector('.answer-voting-card.selected');
        
        try {
            const response = await fetch(`${this.apiUrl}/api/games/${this.gameId}/vote`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    player_id: this.playerId,
                    voted_answer_id: selectedVoteId.dataset.answerId
                })
            });
            
            const data = await response.json();
            if (data.status === 'voted') {
                this.goToResults();
            }
        } catch (error) {
            console.error('Error submitting votes:', error);
        }
    }
};
```

## Step 7: Run with Docker

```bash
# Build and start all containers
docker-compose up --build

# Access:
# Frontend: http://localhost:3000
# Backend: http://localhost:8000
# API Docs: http://localhost:8000/docs
```

## Step 8: Environment Variables (Optional)

Create `.env` file:

```
DATABASE_URL=postgresql://user:password@db:5432/party_game
BACKEND_URL=http://backend:8000
FRONTEND_URL=http://localhost:3000
```

## API Endpoints Your Frontend Needs

```
POST   /api/games                      # Create new game
GET    /api/games/{game_id}           # Get game details
POST   /api/games/{game_id}/players   # Add player
GET    /api/games/{game_id}/question  # Get next question
POST   /api/games/{game_id}/answer    # Submit answer
GET    /api/games/{game_id}/answers   # Get all answers
POST   /api/games/{game_id}/vote      # Submit vote
GET    /api/games/{game_id}/results   # Get leaderboard
```

## Troubleshooting

**CORS Errors**: Make sure `allow_origins=["*"]` is set in FastAPI CORS middleware

**Connection Refused**: Use `http://backend:8000` inside Docker, `http://localhost:8000` from outside

**Port Already In Use**: Change ports in docker-compose.yml

**Static Files Not Loading**: Ensure nginx.conf routes are correct

---

For production, replace `allow_origins=["*"]` with specific domains and use environment variables for API URLs.
