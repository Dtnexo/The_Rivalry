FROM node:18

WORKDIR /app

COPY package*.json ./

RUN apt-get update && apt-get install -y build-essential python3

RUN npm install

COPY . .

EXPOSE 3000
EXPOSE 9208/udp

CMD ["npm", "start"]
