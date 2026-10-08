/** @type {import('next').NextConfig} */
export default {
  // data/*.jsonl and data/targets.json are read at request time from the working directory
  outputFileTracingIncludes: { "/**": ["./data/observations.jsonl", "./data/targets.json"] },
};
