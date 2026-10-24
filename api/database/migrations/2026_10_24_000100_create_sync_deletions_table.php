<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Tombstones so offline mirrors (GET /app/sync) learn which school records were deleted since their last sync. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sync_deletions', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->string('table', 64);
            $t->unsignedBigInteger('row_id');
            $t->timestamp('deleted_at')->useCurrent();
            $t->index(['company_id', 'deleted_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sync_deletions');
    }
};
