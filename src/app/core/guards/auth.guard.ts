import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

/**
 * Lets a signed-in caller through, and asks the server first if it has to.
 *
 * <p>This used to read the session synchronously, because the token sat in
 * `localStorage` and was there the instant the application started. It is a
 * cookie now (§4.6), which script cannot read — so on a cold page load the
 * browser genuinely does not know who it is until the server says.
 *
 * <p>Getting that wrong is not subtle: returning false while the answer is
 * still in flight would bounce every signed-in user to the login screen on
 * every refresh, having apparently forgotten them. So the guard waits for the
 * one request, once, and every later navigation reads the resolved signal
 * without asking again.
 */
export const authGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  const decide = (signedIn: boolean) => {
    if (!signedIn) router.navigate(['/login']);
    return signedIn;
  };

  return auth.resolved()
    ? decide(auth.isLoggedIn())
    : (auth.restoreSession().pipe(map(decide)) as Observable<boolean>);
};
