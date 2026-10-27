<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('custom_fields', 'label_en')) {
            Schema::table('custom_fields', fn (Blueprint $t) => $t->string('label_en')->nullable()->after('label'));
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('custom_fields', 'label_en')) {
            Schema::table('custom_fields', fn (Blueprint $t) => $t->dropColumn('label_en'));
        }
    }
};
