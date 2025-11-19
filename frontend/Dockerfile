# --- Stage 1: Build ---
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json tsconfig.json vite.config.ts ./

# Install all dependencies including devDependencies
RUN npm install

# Copy source code
COPY ./src ./src
COPY ./public ./public

# Build the app
RUN npm run build

# --- Stage 2: Serve ---
FROM nginx:alpine

# Remove default nginx content
RUN rm -rf /usr/share/nginx/html/*

# Copy built files
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
