# Use the official Python base image with Python 3.10
FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Copy the requirements file into the container
COPY requirements.txt .

# Install the dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the FastAPI application code into the container
COPY ./app ./app
COPY ./main.py ./main.py

# Expose the application port
EXPOSE 8686

# Command to run the FastAPI app using uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8686", "--reload"]