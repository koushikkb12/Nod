import { describe, expect, it } from "vitest";
import { parseBoardUrl, parseJobUrl } from "./job-url";

const uuid = "6ed76ce8-4156-4b60-b120-403538bd66cd";

describe("parseJobUrl", () => {
  it("reads Greenhouse links", () => {
    expect(parseJobUrl("https://job-boards.greenhouse.io/monzo/jobs/7343996")).toEqual({ source: "greenhouse", token: "monzo", jobId: "7343996" });
    expect(parseJobUrl("https://boards.greenhouse.io/monzo/jobs/7343996?gh_src=x")).toEqual({ source: "greenhouse", token: "monzo", jobId: "7343996" });
    expect(parseJobUrl("https://boards.greenhouse.io/embed/job_app?for=wise&token=123")).toEqual({ source: "greenhouse", token: "wise", jobId: "123" });
  });

  it("reads Lever links, including the apply page", () => {
    expect(parseJobUrl(`https://jobs.lever.co/palantir/${uuid}`)).toEqual({ source: "lever", token: "palantir", jobId: uuid });
    expect(parseJobUrl(`https://jobs.lever.co/palantir/${uuid}/apply`)?.jobId).toBe(uuid);
  });

  it("reads Ashby links, including the application page", () => {
    expect(parseJobUrl(`https://jobs.ashbyhq.com/ramp/${uuid}/application`)).toEqual({ source: "ashby", token: "ramp", jobId: uuid });
  });

  it("rejects other sites and malformed links", () => {
    expect(parseJobUrl("not a url")).toBeNull();
    expect(parseJobUrl("https://www.linkedin.com/jobs/view/123")).toBeNull();
    expect(parseJobUrl("https://job-boards.greenhouse.io/monzo")).toBeNull();
    expect(parseJobUrl("https://jobs.lever.co/palantir/not-a-uuid")).toBeNull();
    expect(parseJobUrl("ftp://jobs.lever.co/palantir/" + uuid)).toBeNull();
    expect(parseJobUrl("https://evil.example/jobs.lever.co/palantir/" + uuid)).toBeNull();
  });
});

describe("parseBoardUrl", () => {
  it("reads board links and job links", () => {
    expect(parseBoardUrl("https://job-boards.greenhouse.io/monzo")).toEqual({ source: "greenhouse", token: "monzo" });
    expect(parseBoardUrl("https://jobs.lever.co/palantir/")).toEqual({ source: "lever", token: "palantir" });
    expect(parseBoardUrl("https://jobs.ashbyhq.com/ramp")).toEqual({ source: "ashby", token: "ramp" });
    expect(parseBoardUrl(`https://jobs.lever.co/palantir/${uuid}`)).toEqual({ source: "lever", token: "palantir" });
  });

  it("rejects other links", () => {
    expect(parseBoardUrl("https://boards.greenhouse.io/embed/job_board")).toBeNull();
    expect(parseBoardUrl("https://example.com/monzo")).toBeNull();
    expect(parseBoardUrl("https://jobs.lever.co/")).toBeNull();
  });
});
