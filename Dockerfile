# Use Node.js 22 as base image
FROM node:22

# Set working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json first (for better Docker caching)
COPY package*.json ./

# Install dependencies (use npm ci for faster, stable installs)
RUN npm ci --omit=dev

# Copy the rest of the project files
COPY . .

# Use environment variable for port binding
ENV PORT=5000

# Expose the correct port
EXPOSE 5000

# Start the application
CMD ["node", "index.js"]
