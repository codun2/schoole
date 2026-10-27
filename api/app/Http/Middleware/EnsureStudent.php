<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Allow only student accounts (the student portal) through. */
class EnsureStudent
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || ! $user->isStudent()) {
            return response()->json(['message' => 'Student access only.'], 403);
        }

        return $next($request);
    }
}
