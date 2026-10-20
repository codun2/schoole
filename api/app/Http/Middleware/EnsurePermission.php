<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsurePermission
{
    /**
     * Gate a route group behind a staff page permission, e.g. middleware('perm:cars').
     * Company admins pass everything; staff need the page key in their permissions.
     */
    public function handle(Request $request, Closure $next, string $key): Response
    {
        $user = $request->user();

        if (! $user || ! $user->hasPerm($key)) {
            return response()->json(['message' => 'You do not have permission for this section.'], 403);
        }

        return $next($request);
    }
}
