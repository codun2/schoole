<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Stored responses for write requests that carry an Idempotency-Key header, so the offline
 * outbox can safely re-send a create/update/delete after a dropped connection without
 * producing duplicate records.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('idempotency_keys', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('user_id');
            $t->string('key', 80);
            $t->string('method', 8);
            $t->string('path', 255);
            $t->unsignedSmallInteger('status');
            $t->longText('response');
            $t->timestamp('created_at')->useCurrent();
            $t->unique(['user_id', 'key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('idempotency_keys');
    }
};
