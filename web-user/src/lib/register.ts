export type ReferralResolved = {
  referral_code: string;
  sponsor_account_id: string;
  sponsor_login_id: string;
  sponsor_display_name: string;
};

export function isPasswordConfirmationValid(password: string, passwordConfirm: string, minLength = 8) {
  if (password.length < minLength) {
    return false;
  }

  return password === passwordConfirm;
}

export function syncReferralResolutionOnCodeChange(
  current: ReferralResolved | null,
  nextReferralCode: string
): ReferralResolved | null {
  if (!current) {
    return null;
  }

  return current.referral_code === nextReferralCode.trim() ? current : null;
}
