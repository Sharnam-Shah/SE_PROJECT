# Use Python 3.11 slim image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first to leverage Docker cache
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install daphne

# Copy project files
COPY . .

# Run the application using Daphne (for WebSockets support)
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "legal_doc_generator.asgi:application"]
