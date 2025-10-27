
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source code
COPY . .

# Create public directory and move frontend files
RUN mkdir -p public
COPY index.html ./public/
COPY style.css ./public/
COPY script.js ./public/

# Create data directory for SQLite
RUN mkdir -p data

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "server.js"]
