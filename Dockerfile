FROM node:18-alpine

WORKDIR /app

# Copy package files from the zeabur-backend directory
COPY zeabur-backend/package*.json ./

RUN npm install

# Copy all files from the zeabur-backend directory
COPY zeabur-backend/ .

EXPOSE 8080

CMD ["node", "index.js"]
