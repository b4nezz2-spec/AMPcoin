FROM node:22-slim

WORKDIR /app

# Install build tools for native npm packages (pg, bcrypt)
RUN apt-get update && apt-get install -y \
  python3 \
  make \
  g++ \
  && rm -rf /var/lib/apt/lists/*

# Copy package files first for Docker layer caching
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy backend source
COPY backend/ ./backend/
COPY server.js ./
COPY Procfile ./

EXPOSE 8080

CMD ["node", "server.js"]
