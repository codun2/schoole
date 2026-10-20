<?php

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    // Static frontend is served by nginx on the same origin in production;
    // these cover local dev. Token (Bearer) auth — no cookies.
    'allowed_origins' => [
        'https://schoole.app',
        'http://localhost:8010',
        'http://127.0.0.1:8010',
        'http://localhost:8092',
        'http://127.0.0.1:8092',
    ],

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,
];
