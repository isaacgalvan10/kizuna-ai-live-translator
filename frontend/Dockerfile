# frontend/Dockerfile
FROM node:24.11.0-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# Expose Vite's default port
EXPOSE 5173

# "--host" is CRITICAL. It tells Vite "Accept connections from outside the container"
CMD ["npm", "run", "dev", "--", "--host"] 