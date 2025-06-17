FROM node:23-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN npm run build
EXPOSE 3003
ENV NODE_ENV production
CMD [ "node", "dist/index.js" ]