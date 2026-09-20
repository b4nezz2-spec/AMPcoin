import discord
from discord.ext import commands
import json
import os
from datetime import datetime, timedelta

intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True
intents.members = True
intents.moderation = True
intents.bans = True
intents.voice_states = True
intents.typing = True
intents.presences = True

# Initialize bot with '?' prefix
bot = commands.Bot(command_prefix='?', intents=intents, help_command=None)

config_file = 'discord_config.json'
banned_users_file = 'banned_users.json'

def load_config():
    if os.path.exists(config_file):
        with open(config_file, 'r') as f:
            return json.load(f)
    return {}

def save_config(config):
    with open(config_file, 'w') as f:
        json.dump(config, f, indent=4)

def load_banned_users():
    if os.path.exists(banned_users_file):
        with open(banned_users_file, 'r') as f:
            return json.load(f)
    return {}

def save_banned_users(data):
    with open(banned_users_file, 'w') as f:
        json.dump(data, f, indent=4)

@bot.event
async def on_ready():
    print(f'{bot.user} has connected to Discord!')
    await bot.change_presence(activity=discord.Game(name="AMPcoin Assistant"))
    # Sync slash commands with Discord
    try:
        await bot.tree.sync()
        print("Slash commands synced successfully!")
    except Exception as e:
        print(f"Error syncing slash commands: {e}")

# Define slash commands using the new application command system
@bot.tree.command(name="help", description="Show help information")
async def help_command(interaction: discord.Interaction):
    embed = discord.Embed(
        title="AMPcoin Assistant Help",
        description="List of available commands:",
        color=0x00ff00
    )
    
    commands_list = [
        ("`/help` or `?help`", "Show this help message"),
        ("`/ban` or `?ban <user> [reason]`", "Ban a user from the server"),
        ("`/unban` or `?unban <user_id>`", "Unban a user from the server"),
        ("`/mute` or `?mute <user> [duration] [reason]`", "Mute a user (duration in minutes)"),
        ("`/unmute` or `?unmute <user>`", "Unmute a user"),
        ("`/timeout` or `?timeout <user> [duration] [reason]`", "Timeout a user (duration in minutes)"),
        ("`/untimeout` or `?untimeout <user>`", "Remove timeout from a user"),
        ("`/giverole` or `?giverole <user> <role>`", "Give a role to a user"),
        ("`/addrole` or `?addrole <user> <role>`", "Add a role to a user (same as giverole)"),
        ("`/removerole` or `?removerole <user> <role>`", "Remove a role from a user"),
        ("`/deleterole` or `?deleterole <role>`", "Delete a role from the server"),
        ("`/setlogs` or `?setlogs <channel>`", "Set the logs channel"),
        ("`/setappeal` or `?setappeal <channel>`", "Set the appeal channel"),
        ("`/createbannedrole` or `?createbannedrole`", "Create a banned role that restricts channel access except appeal channel")
    ]
    
    for cmd, desc in commands_list:
        embed.add_field(name=cmd, value=desc, inline=False)
    
    await interaction.response.send_message(embed=embed, ephemeral=True)

@bot.tree.command(name="setlogs", description="Set the logs channel for moderation actions")
async def set_logs_slash(interaction: discord.Interaction, channel: discord.TextChannel):
    if not interaction.user.guild_permissions.administrator:
        await interaction.response.send_message("You don't have permission to use this command.", ephemeral=True)
        return
    
    config = load_config()
    guild_id = str(interaction.guild.id)
    
    if guild_id not in config:
        config[guild_id] = {}
    
    config[guild_id]['logs_channel'] = channel.id
    save_config(config)
    
    embed = discord.Embed(
        title="Logs Channel Set",
        description=f"Logs channel has been set to {channel.mention}",
        color=0x00ff00
    )
    await interaction.response.send_message(embed=embed, ephemeral=True)

@bot.tree.command(name="setappeal", description="Set the appeal channel for banned users")
async def set_appeal_slash(interaction: discord.Interaction, channel: discord.TextChannel):
    if not interaction.user.guild_permissions.administrator:
        await interaction.response.send_message("You don't have permission to use this command.", ephemeral=True)
        return
    
    config = load_config()
    guild_id = str(interaction.guild.id)
    
    if guild_id not in config:
        config[guild_id] = {}
    
    config[guild_id]['appeal_channel'] = channel.id
    save_config(config)
    
    embed = discord.Embed(
        title="Appeal Channel Set",
        description=f"Appeal channel has been set to {channel.mention}",
        color=0x00ff00
    )
    await interaction.response.send_message(embed=embed, ephemeral=True)

@bot.tree.command(name="createbannedrole", description="Create a banned role that restricts channel access except appeal channel")
async def create_banned_role_slash(interaction: discord.Interaction):
    if not interaction.user.guild_permissions.administrator:
        await interaction.response.send_message("You don't have permission to use this command.", ephemeral=True)
        return
    
    config = load_config()
    guild_id = str(interaction.guild.id)
    appeal_channel_id = config.get(guild_id, {}).get('appeal_channel')
    
    if not appeal_channel_id:
        embed = discord.Embed(
            title="Error",
            description="Please set an appeal channel first using `/setappeal <channel>` or `?setappeal <channel>`",
            color=0xff0000
        )
        await interaction.response.send_message(embed=embed, ephemeral=True)
        return
    
    appeal_channel = interaction.guild.get_channel(appeal_channel_id)
    if not appeal_channel:
        embed = discord.Embed(
            title="Error",
            description="Appeal channel not found. Please set it again using `/setappeal <channel>` or `?setappeal <channel>`",
            color=0xff0000
        )
        await interaction.response.send_message(embed=embed, ephemeral=True)
        return
    
    # Check if banned role already exists
    banned_role = None
    for role in interaction.guild.roles:
        if role.name.lower() == "banned":
            banned_role = role
            break
    
    if banned_role:
        embed = discord.Embed(
            title="Error",
            description="Banned role already exists!",
            color=0xff0000
        )
        await interaction.response.send_message(embed=embed, ephemeral=True)
        return
    
    try:
        # Create the banned role
        banned_role = await interaction.guild.create_role(
            name="Banned",
            reason="Banned role for AMPcoin Assistant"
        )
        
        # Deny permissions for all channels except appeal channel
        for channel in interaction.guild.channels:
            if channel.id == appeal_channel_id:
                # Allow view for appeal channel
                await channel.set_permissions(banned_role, view_channel=True, send_messages=True)
            else:
                # Deny view for all other channels
                await channel.set_permissions(banned_role, view_channel=False)
        
        embed = discord.Embed(
            title="Banned Role Created",
            description=f"Banned role created and applied. Users with this role will only see the {appeal_channel.mention} channel.",
            color=0x00ff00
        )
        await interaction.response.send_message(embed=embed, ephemeral=True)
        
    except Exception as e:
        embed = discord.Embed(
            title="Error",
            description=f"Could not create banned role: {str(e)}",
            color=0xff0000
        )
        await interaction.response.send_message(embed=embed, ephemeral=True)

@bot.tree.command(name="ban", description="Ban a user from the server")
async def ban_user_slash(interaction: discord.Interaction, user: discord.Member, reason: str = "No reason provided"):
    if not interaction.user.guild_permissions.ban_members:
        await interaction.response.send_message("You don't have permission to use this command.", ephemeral=True)
        return
    
    config = load_config()
    guild_id = str(interaction.guild.id)
    
    logs_channel_id = config.get(guild_id, {}).get('logs_channel')
    appeal_channel_id = config.get(guild_id, {}).get('appeal_channel')
    
    logs_channel = None
    appeal_channel = None
    
    if logs_channel_id:
        logs_channel = interaction.guild.get_channel(logs_channel_id)
    if appeal_channel_id:
        appeal_channel = interaction.guild.get_channel(appeal_channel_id)
    
    # Get the banned role if it exists
    banned_role = None
    for role in interaction.guild.roles:
        if role.name.lower() == "banned":
            banned_role = role
            break
    
    try:
        # Store user's roles before removing them (excluding @everyone)
        user_roles = [role.id for role in user.roles if not role.is_default()]
        
        # Save the user's roles to the banned_users file
        banned_users_data = load_banned_users()
        user_key = f"{interaction.guild.id}-{user.id}"
        banned_users_data[user_key] = {
            "roles": user_roles,
            "timestamp": datetime.utcnow().isoformat(),
            "reason": reason,
            "moderator_id": interaction.user.id
        }
        save_banned_users(banned_users_data)
        
        # Remove all roles from the user
        if user_roles:
            try:
                # Convert role IDs back to role objects
                roles_to_remove = [interaction.guild.get_role(role_id) for role_id in user_roles if interaction.guild.get_role(role_id)]
                roles_to_remove = [role for role in roles_to_remove if role is not None]  # Filter out None values
                await user.remove_roles(*roles_to_remove, reason="User banned - removing all roles")
            except:
                pass  # Ignore if we can't remove roles
        
        dm_embed = discord.Embed(
            title="You have been banned",
            description=f"You have been banned from {interaction.guild.name}",
            color=0xff0000,
            timestamp=datetime.utcnow()
        )
        
        dm_embed.add_field(name="Banned by:", value=interaction.user.mention, inline=False)
        dm_embed.add_field(name="Reason:", value=reason, inline=False)
        
        if appeal_channel:
            dm_embed.add_field(name="Appeal:", value=f"You can appeal this ban in {appeal_channel.mention}", inline=False)
        
        dm_embed.set_footer(text=f"{bot.user.name} | AMPcoin Assistant")
        
        try:
            await user.send(embed=dm_embed)
        except discord.Forbidden:
            pass
        
        # If banned role exists, add it to the user before banning
        if banned_role:
            try:
                await user.add_roles(banned_role, reason="User banned - applying banned role")
            except:
                pass  # Ignore if we can't add the role
        
        await user.ban(reason=reason)
        
        log_embed = discord.Embed(
            title="User Banned",
            color=0xff0000,
            timestamp=datetime.utcnow()
        )
        log_embed.add_field(name="User", value=user.mention, inline=True)
        log_embed.add_field(name="Moderator", value=interaction.user.mention, inline=True)
        log_embed.add_field(name="Reason", value=reason, inline=False)
        
        if logs_channel:
            await logs_channel.send(embed=log_embed)
        else:
            # Send to the channel where the command was used if no logs channel
            await interaction.followup.send(embed=log_embed, ephemeral=True)
        
        success_embed = discord.Embed(
            title="User Banned Successfully",
            description=f"{user.mention} has been banned.",
            color=0x00ff00
        )
        await interaction.followup.send(embed=success_embed, ephemeral=True)
        
    except Exception as e:
        error_embed = discord.Embed(
            title="Error",
            description=f"Could not ban user: {str(e)}",
            color=0xff0000
        )
        await interaction.followup.send(embed=error_embed, ephemeral=True)

@bot.tree.command(name="unban", description="Unban a user from the server")
async def unban_user_slash(interaction: discord.Interaction, user_id: str):
    if not interaction.user.guild_permissions.ban_members:
        await interaction.response.send_message("You don't have permission to use this command.", ephemeral=True)
        return
    
    try:
        user_id_int = int(user_id)
    except ValueError:
        await interaction.response.send_message("Please provide a valid user ID.", ephemeral=True)
        return
    
    config = load_config()
    guild_id = str(interaction.guild.id)
    
    logs_channel_id = config.get(guild_id, {}).get('logs_channel')
    logs_channel = None
    
    if logs_channel_id:
        logs_channel = interaction.guild.get_channel(logs_channel_id)
    
    try:
        user = await bot.fetch_user(user_id_int)
        
        # Try to remove the banned role if it exists
        guild = interaction.guild
        banned_role = None
        for role in guild.roles:
            if role.name.lower() == "banned":
                banned_role = role
                break
        
        if banned_role:
            try:
                # Check if user is in the guild (they might have left after being banned)
                member = await guild.fetch_member(user_id_int)
                if banned_role in member.roles:
                    await member.remove_roles(banned_role, reason="User unbanned - removing banned role")
            except discord.NotFound:
                # User is not in the guild, which is expected when they're banned
                pass
        
        # Restore user's roles if they were saved
        banned_users_data = load_banned_users()
        user_key = f"{guild.id}-{user_id_int}"
        user_roles = []
        
        if user_key in banned_users_data:
            user_roles = banned_users_data[user_key]["roles"]
            # Remove the user's record from banned users
            del banned_users_data[user_key]
            save_banned_users(banned_users_data)
        
        # Unban the user
        await guild.unban(user)
        
        # Try to add roles back if user joins the server again
        # Note: Roles will be restored when the user rejoins the server
        if user_roles:
            try:
                # Wait a bit for the user to potentially rejoin
                await interaction.followup.send(f"User unbanned. Roles will be restored when user rejoins: {[guild.get_role(rid).name for rid in user_roles if guild.get_role(rid)]}", ephemeral=True)
            except:
                pass
        
        log_embed = discord.Embed(
            title="User Unbanned",
            color=0x00ff00,
            timestamp=datetime.utcnow()
        )
        log_embed.add_field(name="User", value=user.mention, inline=True)
        log_embed.add_field(name="Moderator", value=interaction.user.mention, inline=True)
        
        if logs_channel:
            await logs_channel.send(embed=log_embed)
        else:
            await interaction.followup.send(embed=log_embed, ephemeral=True)
        
        success_embed = discord.Embed(
            title="User Unbanned Successfully",
            description=f"<@{user_id_int}> has been unbanned.",
            color=0x00ff00
        )
        await interaction.followup.send(embed=success_embed, ephemeral=True)
        
    except Exception as e:
        error_embed = discord.Embed(
            title="Error",
            description=f"Could not unban user: {str(e)}",
            color=0xff0000
        )
        await interaction.followup.send(embed=error_embed, ephemeral=True)

# Regular text commands for the '?' prefix
@bot.command(name='help')
async def help_text(ctx):
    embed = discord.Embed(
        title="AMPcoin Assistant Help",
        description="List of available commands:",
        color=0x00ff00
    )
    
    commands_list = [
        ("`?help`", "Show this help message"),
        ("`?ban <user> [reason]`", "Ban a user from the server"),
        ("`?unban <user_id>`", "Unban a user from the server"),
        ("`?mute <user> [duration] [reason]`", "Mute a user (duration in minutes)"),
        ("`?unmute <user>`", "Unmute a user"),
        ("`?timeout <user> [duration] [reason]`", "Timeout a user (duration in minutes)"),
        ("`?untimeout <user>`", "Remove timeout from a user"),
        ("`?giverole <user> <role>`", "Give a role to a user"),
        ("`?addrole <user> <role>`", "Add a role to a user (same as giverole)"),
        ("`?removerole <user> <role>`", "Remove a role from a user"),
        ("`?deleterole <role>`", "Delete a role from the server"),
        ("`?setlogs <channel>`", "Set the logs channel"),
        ("`?setappeal <channel>`", "Set the appeal channel"),
        ("`?createbannedrole`", "Create a banned role that restricts channel access except appeal channel")
    ]
    
    for cmd, desc in commands_list:
        embed.add_field(name=cmd, value=desc, inline=False)
    
    await ctx.send(embed=embed)

@bot.command(name='setlogs')
@commands.has_permissions(administrator=True)
async def set_logs_text(ctx, channel: discord.TextChannel):
    config = load_config()
    guild_id = str(ctx.guild.id)
    
    if guild_id not in config:
        config[guild_id] = {}
    
    config[guild_id]['logs_channel'] = channel.id
    save_config(config)
    
    embed = discord.Embed(
        title="Logs Channel Set",
        description=f"Logs channel has been set to {channel.mention}",
        color=0x00ff00
    )
    await ctx.send(embed=embed)

@bot.command(name='setappeal')
@commands.has_permissions(administrator=True)
async def set_appeal_text(ctx, channel: discord.TextChannel):
    config = load_config()
    guild_id = str(ctx.guild.id)
    
    if guild_id not in config:
        config[guild_id] = {}
    
    config[guild_id]['appeal_channel'] = channel.id
    save_config(config)
    
    embed = discord.Embed(
        title="Appeal Channel Set",
        description=f"Appeal channel has been set to {channel.mention}",
        color=0x00ff00
    )
    await ctx.send(embed=embed)

@bot.command(name='createbannedrole')
@commands.has_permissions(administrator=True)
async def create_banned_role_text(ctx):
    config = load_config()
    guild_id = str(ctx.guild.id)
    appeal_channel_id = config.get(guild_id, {}).get('appeal_channel')
    
    if not appeal_channel_id:
        embed = discord.Embed(
            title="Error",
            description="Please set an appeal channel first using `?setappeal <channel>`",
            color=0xff0000
        )
        await ctx.send(embed=embed)
        return
    
    appeal_channel = ctx.guild.get_channel(appeal_channel_id)
    if not appeal_channel:
        embed = discord.Embed(
            title="Error",
            description="Appeal channel not found. Please set it again using `?setappeal <channel>`",
            color=0xff0000
        )
        await ctx.send(embed=embed)
        return
    
    # Check if banned role already exists
    banned_role = None
    for role in ctx.guild.roles:
        if role.name.lower() == "banned":
            banned_role = role
            break
    
    if banned_role:
        embed = discord.Embed(
            title="Error",
            description="Banned role already exists!",
            color=0xff0000
        )
        await ctx.send(embed=embed)
        return
    
    try:
        # Create the banned role
        banned_role = await ctx.guild.create_role(
            name="Banned",
            reason="Banned role for AMPcoin Assistant"
        )
        
        # Deny permissions for all channels except appeal channel
        for channel in ctx.guild.channels:
            if channel.id == appeal_channel_id:
                # Allow view for appeal channel
                await channel.set_permissions(banned_role, view_channel=True, send_messages=True)
            else:
                # Deny view for all other channels
                await channel.set_permissions(banned_role, view_channel=False)
        
        embed = discord.Embed(
            title="Banned Role Created",
            description=f"Banned role created and applied. Users with this role will only see the {appeal_channel.mention} channel.",
            color=0x00ff00
        )
        await ctx.send(embed=embed)
        
    except Exception as e:
        embed = discord.Embed(
            title="Error",
            description=f"Could not create banned role: {str(e)}",
            color=0xff0000
        )
        await ctx.send(embed=embed)

@bot.command(name='ban')
@commands.has_permissions(ban_members=True)
async def ban_user_text(ctx, user: discord.Member, *, reason="No reason provided"):
    config = load_config()
    guild_id = str(ctx.guild.id)
    
    logs_channel_id = config.get(guild_id, {}).get('logs_channel')
    appeal_channel_id = config.get(guild_id, {}).get('appeal_channel')
    
    logs_channel = None
    appeal_channel = None
    
    if logs_channel_id:
        logs_channel = ctx.guild.get_channel(logs_channel_id)
    if appeal_channel_id:
        appeal_channel = ctx.guild.get_channel(appeal_channel_id)
    
    # Get the banned role if it exists
    banned_role = None
    for role in ctx.guild.roles:
        if role.name.lower() == "banned":
            banned_role = role
            break
    
    try:
        # Store user's roles before removing them (excluding @everyone)
        user_roles = [role.id for role in user.roles if not role.is_default()]
        
        # Save the user's roles to the banned_users file
        banned_users_data = load_banned_users()
        user_key = f"{ctx.guild.id}-{user.id}"
        banned_users_data[user_key] = {
            "roles": user_roles,
            "timestamp": datetime.utcnow().isoformat(),
            "reason": reason,
            "moderator_id": ctx.author.id
        }
        save_banned_users(banned_users_data)
        
        # Remove all roles from the user
        if user_roles:
            try:
                # Convert role IDs back to role objects
                roles_to_remove = [ctx.guild.get_role(role_id) for role_id in user_roles if ctx.guild.get_role(role_id)]
                roles_to_remove = [role for role in roles_to_remove if role is not None]  # Filter out None values
                await user.remove_roles(*roles_to_remove, reason="User banned - removing all roles")
            except:
                pass  # Ignore if we can't remove roles
        
        dm_embed = discord.Embed(
            title="You have been banned",
            description=f"You have been banned from {ctx.guild.name}",
            color=0xff0000,
            timestamp=datetime.utcnow()
        )
        
        dm_embed.add_field(name="Banned by:", value=ctx.author.mention, inline=False)
        dm_embed.add_field(name="Reason:", value=reason, inline=False)
        
        if appeal_channel:
            dm_embed.add_field(name="Appeal:", value=f"You can appeal this ban in {appeal_channel.mention}", inline=False)
        
        dm_embed.set_footer(text=f"{bot.user.name} | AMPcoin Assistant")
        
        try:
            await user.send(embed=dm_embed)
        except discord.Forbidden:
            pass
        
        # If banned role exists, add it to the user before banning
        if banned_role:
            try:
                await user.add_roles(banned_role, reason="User banned - applying banned role")
            except:
                pass  # Ignore if we can't add the role
        
        await user.ban(reason=reason)
        
        log_embed = discord.Embed(
            title="User Banned",
            color=0xff0000,
            timestamp=datetime.utcnow()
        )
        log_embed.add_field(name="User", value=user.mention, inline=True)
        log_embed.add_field(name="Moderator", value=ctx.author.mention, inline=True)
        log_embed.add_field(name="Reason", value=reason, inline=False)
        
        if logs_channel:
            await logs_channel.send(embed=log_embed)
        else:
            await ctx.send(embed=log_embed)
        
        success_embed = discord.Embed(
            title="User Banned Successfully",
            description=f"{user.mention} has been banned.",
            color=0x00ff00
        )
        await ctx.send(embed=success_embed)
        
    except Exception as e:
        error_embed = discord.Embed(
            title="Error",
            description=f"Could not ban user: {str(e)}",
            color=0xff0000
        )
        await ctx.send(embed=error_embed)

@bot.command(name='unban')
@commands.has_permissions(ban_members=True)
async def unban_user_text(ctx, user_input: str):
    config = load_config()
    guild_id = str(ctx.guild.id)
    
    logs_channel_id = config.get(guild_id, {}).get('logs_channel')
    logs_channel = None
    
    if logs_channel_id:
        logs_channel = ctx.guild.get_channel(logs_channel_id)
    
    try:
        # Extract user ID from mention or use raw ID
        if user_input.startswith('<@') and user_input.endswith('>'):
            # Mention format: <@123456789> or <@!123456789>
            user_id_str = user_input.replace('<@', '').replace('!', '').replace('>', '')
            try:
                user_id = int(user_id_str)
            except ValueError:
                await ctx.send("Invalid user mention provided.")
                return
        else:
            # Raw ID
            try:
                user_id = int(user_input)
            except ValueError:
                await ctx.send("Please provide a valid user ID or mention.")
                return
        
        user = await bot.fetch_user(user_id)
        
        # Try to remove the banned role if it exists
        banned_role = None
        for role in ctx.guild.roles:
            if role.name.lower() == "banned":
                banned_role = role
                break
        
        if banned_role:
            try:
                # Check if user is in the guild (they might have left after being banned)
                member = await ctx.guild.fetch_member(user_id)
                if banned_role in member.roles:
                    await member.remove_roles(banned_role, reason="User unbanned - removing banned role")
            except discord.NotFound:
                # User is not in the guild, which is expected when they're banned
                pass
        
        # Restore user's roles if they were saved
        banned_users_data = load_banned_users()
        user_key = f"{ctx.guild.id}-{user_id}"
        user_roles = []
        
        if user_key in banned_users_data:
            user_roles = banned_users_data[user_key]["roles"]
            # Remove the user's record from banned users
            del banned_users_data[user_key]
            save_banned_users(banned_users_data)
        
        # Unban the user
        await ctx.guild.unban(user)
        
        # Try to add roles back if user joins the server again
        # Note: Roles will be restored when the user rejoins the server
        if user_roles:
            try:
                # Get role names for the message
                role_names = []
                for rid in user_roles:
                    role_obj = ctx.guild.get_role(rid)
                    if role_obj:
                        role_names.append(role_obj.name)
                
                if role_names:
                    await ctx.send(f"User unbanned. Roles will be restored when user rejoins: {', '.join(role_names)}")
                else:
                    await ctx.send(f"User unbanned. No roles to restore.")
            except:
                await ctx.send(f"User unbanned. Some roles may have been deleted.")
        else:
            await ctx.send(f"User unbanned. No roles to restore.")
        
        log_embed = discord.Embed(
            title="User Unbanned",
            color=0x00ff00,
            timestamp=datetime.utcnow()
        )
        log_embed.add_field(name="User", value=user.mention, inline=True)
        log_embed.add_field(name="Moderator", value=ctx.author.mention, inline=True)
        
        if logs_channel:
            await logs_channel.send(embed=log_embed)
        else:
            await ctx.send(embed=log_embed)
        
        success_embed = discord.Embed(
            title="User Unbanned Successfully",
            description=f"<@{user_id}> has been unbanned.",
            color=0x00ff00
        )
        await ctx.send(embed=success_embed)
        
    except Exception as e:
        error_embed = discord.Embed(
            title="Error",
            description=f"Could not unban user: {str(e)}",
            color=0xff0000
        )
        await ctx.send(embed=error_embed)

@bot.event
async def on_member_join(member):
    # Check if the user was banned and had roles saved
    banned_users_data = load_banned_users()
    user_key = f"{member.guild.id}-{member.id}"
    
    if user_key in banned_users_data:
        user_roles = banned_users_data[user_key]["roles"]
        
        # Add the roles back to the user
        roles_to_add = []
        for role_id in user_roles:
            role = member.guild.get_role(role_id)
            if role:
                roles_to_add.append(role)
        
        if roles_to_add:
            try:
                await member.add_roles(*roles_to_add, reason="Restoring roles after unban")
                print(f"Restored {len(roles_to_add)} roles to {member.display_name}")
            except Exception as e:
                print(f"Failed to restore roles to {member.display_name}: {e}")
        
        # Remove the user's record from banned users since roles are restored
        del banned_users_data[user_key]
        save_banned_users(banned_users_data)
    
    # Handle regular banned user check
    try:
        await member.guild.fetch_ban(member)
        config = load_config()
        guild_id = str(member.guild.id)
        appeal_channel_id = config.get(guild_id, {}).get('appeal_channel')
        
        if appeal_channel_id:
            appeal_channel = member.guild.get_channel(appeal_channel_id)
            try:
                await member.send(f"You are still banned from {member.guild.name}. Please appeal in {appeal_channel.mention}")
            except discord.Forbidden:
                pass
        
        await member.kick(reason="Rejoined while banned")
    except discord.NotFound:
        pass

@bot.command(name='mute')
@commands.has_permissions(manage_roles=True)
async def mute_user_text(ctx, user: discord.Member, duration: int = 10, *, reason="No reason provided"):
    config = load_config()
    guild_id = str(ctx.guild.id)
    
    logs_channel_id = config.get(guild_id, {}).get('logs_channel')
    logs_channel = None
    
    if logs_channel_id:
        logs_channel = ctx.guild.get_channel(logs_channel_id)
    
    try:
        muted_role = None
        for role in ctx.guild.roles:
            if role.name.lower() == "muted":
                muted_role = role
                break
        
        if not muted_role:
            muted_role = await ctx.guild.create_role(
                name="Muted",
                permissions=discord.Permissions(send_messages=False, speak=False),
                reason="Muted role for AMPcoin Assistant"
            )
            
            for channel in ctx.guild.channels:
                try:
                    await channel.set_permissions(muted_role, send_messages=False, speak=False)
                except:
                    continue
        
        await user.add_roles(muted_role, reason=reason)
        
        log_embed = discord.Embed(
            title="User Muted",
            color=0xffa500,
            timestamp=datetime.utcnow()
        )
        log_embed.add_field(name="User", value=user.mention, inline=True)
        log_embed.add_field(name="Moderator", value=ctx.author.mention, inline=True)
        log_embed.add_field(name="Duration", value=f"{duration} minutes", inline=True)
        log_embed.add_field(name="Reason", value=reason, inline=False)
        
        if logs_channel:
            await logs_channel.send(embed=log_embed)
        else:
            await ctx.send(embed=log_embed)
        
        success_embed = discord.Embed(
            title="User Muted Successfully",
            description=f"{user.mention} has been muted for {duration} minutes.",
            color=0x00ff00
        )
        await ctx.send(embed=success_embed)
        
        await discord.utils.sleep_until(datetime.utcnow() + timedelta(minutes=duration))
        await user.remove_roles(muted_role)
        
        unmute_embed = discord.Embed(
            title="User Automatically Unmuted",
            description=f"{user.mention}'s mute has expired.",
            color=0x00ff00,
            timestamp=datetime.utcnow()
        )
        if logs_channel:
            await logs_channel.send(embed=unmute_embed)
        
    except Exception as e:
        error_embed = discord.Embed(
            title="Error",
            description=f"Could not mute user: {str(e)}",
            color=0xff0000
        )
        await ctx.send(embed=error_embed)

@bot.command(name='unmute')
@commands.has_permissions(manage_roles=True)
async def unmute_user_text(ctx, user: discord.Member):
    config = load_config()
    guild_id = str(ctx.guild.id)
    
    logs_channel_id = config.get(guild_id, {}).get('logs_channel')
    logs_channel = None
    
    if logs_channel_id:
        logs_channel = ctx.guild.get_channel(logs_channel_id)
    
    try:
        muted_role = None
        for role in ctx.guild.roles:
            if role.name.lower() == "muted":
                muted_role = role
                break
        
        if not muted_role:
            error_embed = discord.Embed(
                title="Error",
                description="Muted role does not exist!",
                color=0xff0000
            )
            await ctx.send(embed=error_embed)
            return
        
        await user.remove_roles(muted_role)
        
        log_embed = discord.Embed(
            title="User Unmuted",
            color=0x00ff00,
            timestamp=datetime.utcnow()
        )
        log_embed.add_field(name="User", value=user.mention, inline=True)
        log_embed.add_field(name="Moderator", value=ctx.author.mention, inline=True)
        
        if logs_channel:
            await logs_channel.send(embed=log_embed)
        else:
            await ctx.send(embed=log_embed)
        
        success_embed = discord.Embed(
            title="User Unmuted Successfully",
            description=f"{user.mention} has been unmuted.",
            color=0x00ff00
        )
        await ctx.send(embed=success_embed)
        
    except Exception as e:
        error_embed = discord.Embed(
            title="Error",
            description=f"Could not unmute user: {str(e)}",
            color=0xff0000
        )
        await ctx.send(embed=error_embed)

@bot.command(name='timeout')
@commands.has_permissions(moderate_members=True)
async def timeout_user_text(ctx, user: discord.Member, duration: int = 10, *, reason="No reason provided"):
    config = load_config()
    guild_id = str(ctx.guild.id)
    
    logs_channel_id = config.get(guild_id, {}).get('logs_channel')
    logs_channel = None
    
    if logs_channel_id:
        logs_channel = ctx.guild.get_channel(logs_channel_id)
    
    try:
        await user.timeout(until=datetime.utcnow() + timedelta(minutes=duration), reason=reason)
        
        log_embed = discord.Embed(
            title="User Timed Out",
            color=0xffa500,
            timestamp=datetime.utcnow()
        )
        log_embed.add_field(name="User", value=user.mention, inline=True)
        log_embed.add_field(name="Moderator", value=ctx.author.mention, inline=True)
        log_embed.add_field(name="Duration", value=f"{duration} minutes", inline=True)
        log_embed.add_field(name="Reason", value=reason, inline=False)
        
        if logs_channel:
            await logs_channel.send(embed=log_embed)
        else:
            await ctx.send(embed=log_embed)
        
        success_embed = discord.Embed(
            title="User Timed Out Successfully",
            description=f"{user.mention} has been timed out for {duration} minutes.",
            color=0x00ff00
        )
        await ctx.send(embed=success_embed)
        
    except Exception as e:
        error_embed = discord.Embed(
            title="Error",
            description=f"Could not timeout user: {str(e)}",
            color=0xff0000
        )
        await ctx.send(embed=error_embed)

@bot.command(name='untimeout')
@commands.has_permissions(moderate_members=True)
async def untimeout_user_text(ctx, user: discord.Member):
    config = load_config()
    guild_id = str(ctx.guild.id)
    
    logs_channel_id = config.get(guild_id, {}).get('logs_channel')
    logs_channel = None
    
    if logs_channel_id:
        logs_channel = ctx.guild.get_channel(logs_channel_id)
    
    try:
        await user.timeout(until=None)
        
        log_embed = discord.Embed(
            title="User Timeout Removed",
            color=0x00ff00,
            timestamp=datetime.utcnow()
        )
        log_embed.add_field(name="User", value=user.mention, inline=True)
        log_embed.add_field(name="Moderator", value=ctx.author.mention, inline=True)
        
        if logs_channel:
            await logs_channel.send(embed=log_embed)
        else:
            await ctx.send(embed=log_embed)
        
        success_embed = discord.Embed(
            title="User Timeout Removed Successfully",
            description=f"{user.mention}'s timeout has been removed.",
            color=0x00ff00
        )
        await ctx.send(embed=success_embed)
        
    except Exception as e:
        error_embed = discord.Embed(
            title="Error",
            description=f"Could not remove timeout from user: {str(e)}",
            color=0xff0000
        )
        await ctx.send(embed=error_embed)

@bot.command(name='giverole')
@commands.has_permissions(manage_roles=True)
async def give_role_text(ctx, user: discord.Member, *, role_name: str):
    config = load_config()
    guild_id = str(ctx.guild.id)
    
    logs_channel_id = config.get(guild_id, {}).get('logs_channel')
    logs_channel = None
    
    if logs_channel_id:
        logs_channel = ctx.guild.get_channel(logs_channel_id)
    
    try:
        target_role = None
        for role in ctx.guild.roles:
            if role.name.lower() == role_name.lower():
                target_role = role
                break
        
        if not target_role:
            error_embed = discord.Embed(
                title="Error",
                description=f"Role '{role_name}' not found!",
                color=0xff0000
            )
            await ctx.send(embed=error_embed)
            return
        
        await user.add_roles(target_role)
        
        log_embed = discord.Embed(
            title="Role Given",
            color=0x00ff00,
            timestamp=datetime.utcnow()
        )
        log_embed.add_field(name="User", value=user.mention, inline=True)
        log_embed.add_field(name="Role", value=target_role.mention, inline=True)
        log_embed.add_field(name="Moderator", value=ctx.author.mention, inline=True)
        
        if logs_channel:
            await logs_channel.send(embed=log_embed)
        else:
            await ctx.send(embed=log_embed)
        
        success_embed = discord.Embed(
            title="Role Given Successfully",
            description=f"{target_role.mention} has been given to {user.mention}.",
            color=0x00ff00
        )
        await ctx.send(embed=success_embed)
        
    except Exception as e:
        error_embed = discord.Embed(
            title="Error",
            description=f"Could not give role: {str(e)}",
            color=0xff0000
        )
        await ctx.send(embed=error_embed)

@bot.command(name='addrole')
@commands.has_permissions(manage_roles=True)
async def add_role_text(ctx, user: discord.Member, *, role_name: str):
    await give_role_text(ctx, user, role_name=role_name)

@bot.command(name='removerole')
@commands.has_permissions(manage_roles=True)
async def remove_role_text(ctx, user: discord.Member, *, role_name: str):
    config = load_config()
    guild_id = str(ctx.guild.id)
    
    logs_channel_id = config.get(guild_id, {}).get('logs_channel')
    logs_channel = None
    
    if logs_channel_id:
        logs_channel = ctx.guild.get_channel(logs_channel_id)
    
    try:
        target_role = None
        for role in ctx.guild.roles:
            if role.name.lower() == role_name.lower():
                target_role = role
                break
        
        if not target_role:
            error_embed = discord.Embed(
                title="Error",
                description=f"Role '{role_name}' not found!",
                color=0xff0000
            )
            await ctx.send(embed=error_embed)
            return
        
        await user.remove_roles(target_role)
        
        log_embed = discord.Embed(
            title="Role Removed",
            color=0xffa500,
            timestamp=datetime.utcnow()
        )
        log_embed.add_field(name="User", value=user.mention, inline=True)
        log_embed.add_field(name="Role", value=target_role.mention, inline=True)
        log_embed.add_field(name="Moderator", value=ctx.author.mention, inline=True)
        
        if logs_channel:
            await logs_channel.send(embed=log_embed)
        else:
            await ctx.send(embed=log_embed)
        
        success_embed = discord.Embed(
            title="Role Removed Successfully",
            description=f"{target_role.mention} has been removed from {user.mention}.",
            color=0x00ff00
        )
        await ctx.send(embed=success_embed)
        
    except Exception as e:
        error_embed = discord.Embed(
            title="Error",
            description=f"Could not remove role: {str(e)}",
            color=0xff0000
        )
        await ctx.send(embed=error_embed)

@bot.command(name='deleterole')
@commands.has_permissions(manage_roles=True)
async def delete_role_text(ctx, *, role_name: str):
    config = load_config()
    guild_id = str(ctx.guild.id)
    
    logs_channel_id = config.get(guild_id, {}).get('logs_channel')
    logs_channel = None
    
    if logs_channel_id:
        logs_channel = ctx.guild.get_channel(logs_channel_id)
    
    try:
        target_role = None
        for role in ctx.guild.roles:
            if role.name.lower() == role_name.lower():
                target_role = role
                break
        
        if not target_role:
            error_embed = discord.Embed(
                title="Error",
                description=f"Role '{role_name}' not found!",
                color=0xff0000
            )
            await ctx.send(embed=error_embed)
            return
        
        await target_role.delete()
        
        log_embed = discord.Embed(
            title="Role Deleted",
            color=0xff0000,
            timestamp=datetime.utcnow()
        )
        log_embed.add_field(name="Role", value=target_role.name, inline=True)
        log_embed.add_field(name="Moderator", value=ctx.author.mention, inline=True)
        
        if logs_channel:
            await logs_channel.send(embed=log_embed)
        else:
            await ctx.send(embed=log_embed)
        
        success_embed = discord.Embed(
            title="Role Deleted Successfully",
            description=f"Role '{target_role.name}' has been deleted.",
            color=0x00ff00
        )
        await ctx.send(embed=success_embed)
        
    except Exception as e:
        error_embed = discord.Embed(
            title="Error",
            description=f"Could not delete role: {str(e)}",
            color=0xff0000
        )
        await ctx.send(embed=error_embed)

@bot.event
async def on_command_error(ctx, error):
    if isinstance(error, commands.CommandNotFound):
        embed = discord.Embed(
            title="Command Not Found",
            description="Use `?help` to see available commands.",
            color=0xff0000
        )
        await ctx.send(embed=embed)
    elif isinstance(error, commands.MissingPermissions):
        embed = discord.Embed(
            title="Missing Permissions",
            description="You don't have permission to use this command.",
            color=0xff0000
        )
        await ctx.send(embed=embed)
    elif isinstance(error, commands.BadArgument):
        embed = discord.Embed(
            title="Invalid Argument",
            description="Please provide valid arguments for the command.",
            color=0xff0000
        )
        await ctx.send(embed=embed)

TOKEN = os.getenv('DISCORD_BOT_TOKEN', '')
if not TOKEN:
    TOKEN = input("Enter your Discord bot token: ")

bot.run(TOKEN)