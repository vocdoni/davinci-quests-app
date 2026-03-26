FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY ./*.json ./

EXPOSE 3001

CMD ["npm", "run", "start"]
