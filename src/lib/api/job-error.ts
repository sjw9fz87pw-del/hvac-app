/** A refusal about jobs that the person can act on — not a crash. */
export class JobError extends Error {
  constructor(message: string, public status: 404 | 409 = 409) {
    super(message);
    this.name = "JobError";
  }
}
