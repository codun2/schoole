<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void {
        foreach (['expense_categories', 'customers', 'suppliers'] as $t) {
            if (! Schema::hasColumn($t, 'name_en')) {
                Schema::table($t, fn (Blueprint $b) => $b->string('name_en')->nullable()->after('name'));
            }
        }
    }
    public function down(): void {
        foreach (['expense_categories', 'customers', 'suppliers'] as $t) {
            if (Schema::hasColumn($t, 'name_en')) {
                Schema::table($t, fn (Blueprint $b) => $b->dropColumn('name_en'));
            }
        }
    }
};
