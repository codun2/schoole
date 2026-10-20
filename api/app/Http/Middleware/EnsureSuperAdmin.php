<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Allow only the platform owner (role = super) through. Used to gate the
 * company-management API that lives above individual tenants.
 */
class EnsureSuperAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || ! $user->isSuper()) {
            return response()->json(['message' => 'Platform owner access only.'], 403);
        }

        return $next($request);
    }
}
