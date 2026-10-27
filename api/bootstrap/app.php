<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'staff'   => \App\Http\Middleware\EnsureStaff::class,
            'perm'    => \App\Http\Middleware\EnsurePermission::class,
            'company' => \App\Http\Middleware\SetCompanyContext::class,
            'super'   => \App\Http\Middleware\EnsureSuperAdmin::class,
            'guardian' => \App\Http\Middleware\EnsureGuardian::class,
            'teacher' => \App\Http\Middleware\EnsureTeacher::class,
            'student' => \App\Http\Middleware\EnsureStudent::class,
            'idem'    => \App\Http\Middleware\IdempotencyKey::class,
        ]);

        // CRITICAL (multi-tenant isolation): the tenant context must be bound
        // BEFORE route-model binding runs, otherwise SubstituteBindings resolves
        // models with the company scope disabled and leaks cross-tenant records.
        // Pin the order: authenticate → staff → set-company → substitute-bindings.
        $middleware->priority([
            \Illuminate\Foundation\Http\Middleware\HandlePrecognitiveRequests::class,
            \Illuminate\Cookie\Middleware\EncryptCookies::class,
            \Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse::class,
            \Illuminate\Session\Middleware\StartSession::class,
            \Illuminate\View\Middleware\ShareErrorsFromSession::class,
            \Illuminate\Contracts\Auth\Middleware\AuthenticatesRequests::class,
            \App\Http\Middleware\EnsureSuperAdmin::class,
            \App\Http\Middleware\EnsureStaff::class,
            \App\Http\Middleware\EnsureGuardian::class,
            \App\Http\Middleware\EnsureTeacher::class,
            \App\Http\Middleware\SetCompanyContext::class,
            \App\Http\Middleware\EnsurePermission::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
            \Illuminate\Routing\Middleware\ThrottleRequestsWithRedis::class,
            \Illuminate\Routing\Middleware\SubstituteBindings::class,
            \Illuminate\Auth\Middleware\Authorize::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
