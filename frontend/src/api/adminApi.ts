import { api } from "./api";

// Import a list of questions
export const importQuestions = (questions: string[]) => {
  return api.post("/admin/questions/import", { questions });
};

// Get all questions (if your backend supports it)
export const getAllQuestions = () => {
  return api.get("/admin/questions");
};

// Delete a question by ID (if your backend supports it)
export const deleteQuestion = (id: number) => {
  return api.delete(`/admin/questions/${id}`);
};
