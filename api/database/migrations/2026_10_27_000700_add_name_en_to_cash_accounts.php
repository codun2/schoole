<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cash_accounts', function (Blueprint $t) {
            if (! Schema::hasColumn('cash_accounts', 'name_en')) {
                $t->string('name_en')->nullable()->after('name');
            }
            if (! Schema::hasColumn('cash_accounts', 'bank_name_en')) {
                $t->string('bank_name_en')->nullable()->after('bank_name');
            }
        });
    }

    public function down(): void
    {
        Schema::table('cash_accounts', function (Blueprint $t) {
            foreach (['name_en', 'bank_name_en'] as $c) {
                if (Schema::hasColumn('cash_accounts', $c)) {
                    $t->dropColumn($c);
                }
            }
        });
    }
};
