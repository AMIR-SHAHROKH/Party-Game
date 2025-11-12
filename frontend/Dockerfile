# backend/Dockerfile
FROM python:3.11-slim

# Set workdir
WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY ./app ./app

# Expose port
EXPOSE 8000

# Run FastAPI ASGI app
CMD ["uvicorn", "app.main:asgi_app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
