FROM node:20-alpine
WORKDIR /app
COPY package.json /app/package.json
RUN npm install --omit=dev
COPY server.js /app/server.js
COPY panel.json /app/panel.json
COPY public /app/public
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
