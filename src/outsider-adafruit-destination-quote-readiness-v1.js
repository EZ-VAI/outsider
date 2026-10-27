/*
 * Evidence-backed readiness boundary for Adafruit destination quoting.
 *
 * The captured guest checkout exposes contact step 1 only. Adafruit's own
 * guide says rates appear after contact plus shipping/billing address. We do
 * not guess the unseen step-2 form or automate a personal email/address write.
 */

export const OUTSIDER_ADAFRUIT_DESTINATION_QUOTE_READINESS_V1
  = Object.freeze({
    provider: "ADAFRUIT_GUEST_SHOPPER",
    state: "BLOCKED_PENDING_EXPLICIT_CONTACT_AND_FULL_ADDRESS",
    capturedCheckoutStep: 1,
    capturedCheckoutBodyBytes: 69010,
    capturedCheckoutBodySha256:
      "sha256:6040fb6eba67aafd9fda9ae4cb3fd05517178a10bbe5050b6d8bf4e14efe535b",
    observedStep1Endpoint: "POST https://www.adafruit.com/checkout",
    observedStep1Fields: Object.freeze([
      "csrf_token", "email_address", "action=save_one",
    ]),
    providerDocumentedSequence: Object.freeze([
      "CART", "CONTACT_EMAIL", "SHIPPING_AND_BILLING_ADDRESS",
      "SHIPPING_OPTIONS", "PAYMENT", "SUBMIT_ORDER",
    ]),
    minimumDestinationForShippingQuoteGrounded: false,
    fullShippingAddressDocumentedAsRequired: true,
    emailRequiredBeforeAddressStep: true,
    machineStableShippingQuoteEndpointObserved: false,
    quoteAdapterImplemented: false,
    reasonAdapterNotImplemented:
      "STEP_2_FORM_AND_RATE_REQUEST_NOT_CAPTURED_WITH_EXPLICIT_USER_DESTINATION",
    cartCreationImplementedHere: false,
    paymentImplemented: false,
    orderSubmissionImplemented: false,
    sellerEmailImplemented: false,
    nextGate:
      "EXPLICIT_USER_EMAIL_AND_FULL_DESTINATION_THEN_CAPTURE_STEP_2_WITHOUT_PAYMENT",
    authority: "NONE",
    decisionState: "HOLD",
  });
