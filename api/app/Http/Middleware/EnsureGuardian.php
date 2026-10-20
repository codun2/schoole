<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Allow only guardian (parent portal) accounts through. */
class EnsureGuardian
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || ! $user->isGuardian()) {
            return response()->json(['message' => 'Guardian access only.'], 403);
        }

        return $next($request);
    }
}
