declare namespace Express {
  interface Request {
    caregiverId?: string;
    /**
     * Set by `mobileAuthMiddleware` on authenticated `/api/mobile/*` routes.
     * Distinguishes a caregiver-operated request from a patient-operated one.
     * `caregiverId` above remains populated for caregiver actors only, so
     * existing caregiver code paths keep working unchanged.
     */
    mobileActor?: import("../modules/mobile/mobile-auth.service").MobileActor;
  }
}
