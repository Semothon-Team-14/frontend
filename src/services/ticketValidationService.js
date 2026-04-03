import { post } from "../api/httpClient";

export function recognizeBoardingPass({ cityId, imageBase64 }) {
  return post("/ticket-validations/boarding-passes", {
    cityId,
    imageBase64,
  });
}
