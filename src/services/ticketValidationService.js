import { post } from "../api/httpClient";

export function recognizeBoardingPass({ imageBase64, cityId = null }) {
  return post("/ticket-validations/boarding-passes", cityId == null
    ? { imageBase64 }
    : { cityId, imageBase64 });
}
