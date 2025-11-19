// src/apiInstance.ts
import axios from "axios";

// Hardcoded backend URL
export const api = axios.create({
  baseURL: "http://0.0.0.0:8000", // <-- put your backend URL here
});
