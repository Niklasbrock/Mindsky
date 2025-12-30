FROM node:20-alpine

WORKDIR /app

# Install OpenSSL and other dependencies for Prisma on Alpine
RUN apk add --no-cache openssl openssl-dev libc6-compat

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3001

# Run migrations and start the server
CMD ["sh", "-c", "npx prisma db push && npm start"]
