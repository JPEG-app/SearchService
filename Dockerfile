FROM node:23-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

FROM node:23-slim
WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 4001

ENV NODE_ENV production

CMD [ "node", "dist/index.js" ]