<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Allow only teacher accounts (the teacher portal) through. */
class EnsureTeacher
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || ! $user->isTeacher()) {
            return response()->json(['message' => 'Teacher access only.'], 403);
        }

        return $next($request);
    }
}
