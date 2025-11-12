# backend/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Copy requirements
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy app folder
COPY ./app ./app

# Expose port
EXPOSE 8000

# Run the ASGI app
CMD ["uvicorn", "app.main:asgi_app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
