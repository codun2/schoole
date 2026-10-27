<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['inventory_categories', 'inventory_locations', 'inventory_items', 'evaluation_criteria', 'evaluation_periods'] as $table) {
            if (! Schema::hasColumn($table, 'name_en')) {
                Schema::table($table, fn (Blueprint $t) => $t->string('name_en')->nullable()->after('name'));
            }
        }
    }

    public function down(): void
    {
        foreach (['inventory_categories', 'inventory_locations', 'inventory_items', 'evaluation_criteria', 'evaluation_periods'] as $table) {
            if (Schema::hasColumn($table, 'name_en')) {
                Schema::table($table, fn (Blueprint $t) => $t->dropColumn('name_en'));
            }
        }
    }
};
