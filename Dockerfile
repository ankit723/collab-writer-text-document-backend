FROM node:22
WORKDIR .
COPY package*.json .
RUN npm install

COPY . .

EXPOSE 5001

CMD [ "node", "index.js"]