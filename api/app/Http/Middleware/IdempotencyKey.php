<?php

namespace App\Http\Middleware;

use App\Models\IdempotencyKey as StoredKey;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Make write requests safe to retry. When a POST/PATCH/PUT/DELETE carries an
 * `Idempotency-Key` header (the offline outbox always sends one), the first successful
 * JSON response is stored per user; any replay with the same key gets that stored
 * response back instead of running the write again — so a request whose reply was
 * lost on a flaky connection never creates a second student, voucher, etc.
 */
class IdempotencyKey
{
    public function handle(Request $request, Closure $next): Response
    {
        $key = (string) $request->header('Idempotency-Key', '');
        $user = $request->user();

        if ($key === '' || ! $user || ! in_array($request->method(), ['POST', 'PATCH', 'PUT', 'DELETE'], true)) {
            return $next($request);
        }
        $key = substr($key, 0, 80);

        $hit = StoredKey::where('user_id', $user->id)->where('key', $key)->first();
        if ($hit) {
            return response($hit->response, $hit->status, ['Content-Type' => 'application/json', 'Idempotent-Replayed' => 'true']);
        }

        $response = $next($request);

        $isJson = str_starts_with((string) $response->headers->get('Content-Type'), 'application/json');
        if ($response->getStatusCode() < 300 && $isJson) {
            try {
                StoredKey::create([
                    'user_id'    => $user->id,
                    'key'        => $key,
                    'method'     => $request->method(),
                    'path'       => substr($request->path(), 0, 255),
                    'status'     => $response->getStatusCode(),
                    'response'   => $response->getContent(),
                    'created_at' => now(),
                ]);
            } catch (\Throwable $e) {
                report($e); // remembering the key must never fail the write itself
            }
        }

        return $response;
    }
}
