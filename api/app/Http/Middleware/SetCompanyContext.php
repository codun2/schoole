<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Bind the authenticated user's school into the container as
 * `currentCompanyId`. Every model using the BelongsToCompany trait reads this
 * to scope its queries.
 *
 * Runs after auth:sanctum. Platform super-admins have a null company_id, which
 * leaves the tenant scope disabled (they operate across all companies).
 */
class SetCompanyContext
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user) {
            app()->instance('currentCompanyId', $user->company_id);
        }

        return $next($request);
    }
}
