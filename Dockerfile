FROM node:18-alpine

WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

# Copy package files
COPY zeabur-backend/package*.json ./

# Install ONLY production dependencies
RUN npm install --omit=dev

# Copy the rest of the backend code
COPY zeabur-backend/ .

# Ensure the uploads directory exists
RUN mkdir -p uploads

EXPOSE 8080

CMD ["node", "index.js"]
