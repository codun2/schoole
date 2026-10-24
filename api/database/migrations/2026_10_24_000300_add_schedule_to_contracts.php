<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Optional per-installment schedule (dates/amounts edited in the contract builder) — null means an even monthly split. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contracts', function (Blueprint $t) {
            $t->json('schedule')->nullable()->after('first_due_date');
        });
    }

    public function down(): void
    {
        Schema::table('contracts', function (Blueprint $t) {
            $t->dropColumn('schedule');
        });
    }
};
