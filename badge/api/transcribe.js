import app from "../server.js";

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 60,
};

export default function handler(request, response) {
  request.url = "/api/transcribe";
  app(request, response);
}
