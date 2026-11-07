import { describe, expect, it } from "vitest";
import type { FormQuestion } from "@/lib/types";
import { answerQuestion, classify, matchOption, type AnswerContext } from "./answers";

const q = (over: Partial<FormQuestion>): FormQuestion => ({ id: "q", label: "", required: true, type: "text", ...over });

const ctx = (over: Partial<AnswerContext> = {}): AnswerContext => ({
  profile: { fullName: "Alex Morgan", email: "alex@example.com", phone: "", location: "London", links: [{ label: "LinkedIn", url: "https://linkedin.com/in/alex" }] },
  prefs: { rightToWork: "", needsSponsorship: false, noticePeriod: "1 month", minSalary: 50_000, salaryCurrency: "GBP", willingToRelocate: false },
  library: [],
  ...over,
});

describe("classify", () => {
  it("recognises common questions", () => {
    expect(classify(q({ label: "First name" }))).toBe("first_name");
    expect(classify(q({ label: "Will you now or in the future require visa sponsorship?" }))).toBe("sponsorship");
    expect(classify(q({ label: "What is your gender?" }))).toBe("sensitive");
    expect(classify(q({ label: "Why do you want to work here?" }))).toBe("free_text");
  });
});

describe("matchOption", () => {
  const yesNo = q({ type: "select", options: [{ label: "Yes", value: "1" }, { label: "No", value: "0" }] });
  it("maps free text to options", () => {
    expect(matchOption(yesNo, "No, I don't")).toBe("0");
    expect(matchOption(yesNo, "yes")).toBe("1");
    expect(matchOption(yesNo, "maybe")).toBeNull();
  });
});

describe("answerQuestion", () => {
  it("fills from the profile and preferences", () => {
    expect(answerQuestion(q({ label: "Last name" }), ctx()).value).toBe("Morgan");
    expect(answerQuestion(q({ label: "LinkedIn profile" }), ctx()).value).toBe("https://linkedin.com/in/alex");
    expect(answerQuestion(q({ label: "Notice period" }), ctx()).source).toBe("preferences");
  });

  it("never guesses right to work", () => {
    const a = answerQuestion(q({ label: "Do you have the right to work in the UK?" }), ctx());
    expect(a.needsUser).toBe(true);
  });

  it("declines diversity questions by default", () => {
    const a = answerQuestion(
      q({ label: "Ethnicity", type: "select", options: [{ label: "White", value: "w" }, { label: "Prefer not to say", value: "pns" }] }),
      ctx(),
    );
    expect(a).toMatchObject({ value: "pns", source: "sensitive-default", sensitive: true });
  });

  it("reuses the answer library for similar wording", () => {
    const a = answerQuestion(
      q({ label: "Are you legally authorised to work in the UK?" }),
      ctx({ library: [{ label: "Right to work in the UK", normLabel: "right to work in the uk", category: "work_auth", answer: "Yes, British citizen" }] }),
    );
    expect(a).toMatchObject({ value: "Yes, British citizen", source: "library" });
  });
});
