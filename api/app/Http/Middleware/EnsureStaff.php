<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureStaff
{
    /**
     * Allow only authenticated staff/admin users (of a school) through.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || ! $user->isStaff()) {
            return response()->json(['message' => 'Staff access only.'], 403);
        }

        return $next($request);
    }
}
