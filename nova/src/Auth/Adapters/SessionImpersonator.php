<?php

namespace Laravel\Nova\Auth\Adapters;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Contracts\Auth\StatefulGuard;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Laravel\Nova\Contracts\ImpersonatesUsers;
use Laravel\Nova\Events\StartedImpersonating;
use Laravel\Nova\Events\StoppedImpersonating;
use Laravel\Nova\Nova;
use Laravel\Nova\Util;

class SessionImpersonator implements ImpersonatesUsers
{
    /**
     * Start impersonating a user.
     *
     * @return bool
     */
    public function impersonate(Request $request, StatefulGuard $guard, Authenticatable $user)
    {
        return rescue(function () use ($request, $guard, $user) {
            $impersonator = Nova::user($request);

            $request->session()->put(
                'nova_impersonated_by', $impersonator->getAuthIdentifier()
            );
            $request->session()->put(
                'nova_impersonated_remember', $guard->viaRemember()
            );

            $novaGuard = Util::userGuard();

            $authGuard = match (true) {
                property_exists($guard, 'name') => $guard->name,
                method_exists($guard, 'getName') => Str::between($guard->getName(), 'login_', '_'.sha1(get_class($guard))),
                default => null,
            };

            if (is_null($authGuard)) {
                return false;
            }

            if ($novaGuard !== $authGuard) {
                $request->session()->put(
                    'nova_impersonated_guard', $authGuard
                );
            }

            $guard->login($user);

            event(new StartedImpersonating($impersonator, $user));

            return true;
        }, false);
    }

    /**
     * Stop impersonating the currently impersonated user and revert to the original session.
     *
     * @return bool
     */
    public function stopImpersonating(Request $request, StatefulGuard $guard, string $userModel)
    {
        return rescue(function () use ($request, $guard, $userModel) {
            if (! $this->impersonating($request)) {
                return false;
            }

            $user = $request->user($userGuard = $request->session()->get('nova_impersonated_guard'));
            $impersonator = $userModel::findOrFail($request->session()->get('nova_impersonated_by', null));

            if ($request->session()->has('nova_impersonated_guard')) {
                Auth::guard($userGuard)->logout();
            }

            $guard->login($impersonator, $request->session()->get('nova_impersonated_remember') ?? false);

            event(new StoppedImpersonating($impersonator, $user));

            $this->flushImpersonationData($request);

            return true;
        }, false);
    }

    /**
     * Determine if a user is currently being impersonated.
     *
     * @return bool
     */
    public function impersonating(Request $request)
    {
        return $request->session()->has('nova_impersonated_by');
    }

    /**
     * Remove any impersonation data from the session.
     *
     * @return void
     */
    public function flushImpersonationData(Request $request)
    {
        if ($request->hasSession()) {
            $request->session()->forget('nova_impersonated_by');
            $request->session()->forget('nova_impersonated_guard');
            $request->session()->forget('nova_impersonated_remember');
        }
    }

    /**
     * Redirect an admin after starting impersonation.
     *
     * @return \Illuminate\Http\JsonResponse
     */
    public function redirectAfterStartingImpersonation(Request $request)
    {
        return response()->json([
            'redirect' => config('nova.impersonation.started', '/'),
        ]);
    }

    /**
     * Redirect an admin after finishing impersonation.
     *
     * @return \Illuminate\Http\JsonResponse
     */
    public function redirectAfterStoppingImpersonation(Request $request)
    {
        return response()->json([
            'redirect' => config('nova.impersonation.stopped', Nova::url('/')),
        ]);
    }
}
